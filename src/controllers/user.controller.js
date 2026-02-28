import {asyncHandler} from '../utils/asyncHandler.js';
import {ApiError} from '../utils/ApiError.js';
import {User} from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import {ApiResponse} from '../utils/ApiResponse.js'

const generateAccessAndRefreshTokens = async(userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()
        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})
        return {accessToken, refreshToken}
    } catch (error) {
        throw new ApiError(500,"Error generating tokens")
    }
}

const registerUser = asyncHandler(async (req,res) => {
    const {fullname,email,username,password} = req.body
    console.log("email:",email)
    if([
        fullname,email,username,password
    ].some(field => !field)){ // if any field is missing
        throw new ApiError(400,"All fields are required")
    }

    const existeduser = await User.findOne({$or: [{email},{username}]})
    if(existeduser){
        throw new ApiError(409,"User with given email or username already exists")
    }

    const avatarLocalPath = req.files?.avatar[0]?.path 
    const coverImageLocalPath = req.files?.coverImage[0]?.path
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar image is required")
    }
    console.log(req.files)

    const avatarUrl = await uploadOnCloudinary(avatarLocalPath)
    const coverImageUrl = coverImageLocalPath 
        ? await uploadOnCloudinary(coverImageLocalPath)
        : null

    if(!avatarUrl){
        throw new ApiError(500,"Error uploading avatar image")
    }

    const user = await User.create({
        fullname,
        avatar: avatarUrl.url,
        coverImage: coverImageUrl?.url || "",
        email,
        username: username.toLowerCase(),
        password,
    })

    const createdUser = await User.findById(user._id).select('-password -refreshToken')
    if(!createdUser){
        throw new ApiError(500,"Error creating user")
    }

    return res.status(201).json(new ApiResponse(200,createdUser,"User registered successfully"))
})

const loginUser = asyncHandler(async (req,res) => {
    const {email,username,password} = req.body

    if(!username && !email){
        throw new ApiError(400,"Email or username is required")
    }

    const user = await User.findOne({$or: [{email},{username}]})
    if(!user){
        throw new ApiError(404,"User not found")
    }

    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid){
        throw new ApiError(401,"Invalid password")
    }

    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")
    const options = {
        httpOnly: true,
        secure: true}

    return res.status(200).cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(new ApiResponse(200,{
        user: loggedInUser,
        accessToken,
        refreshToken
    },"User logged in successfully"))
})

const logoutUser = asyncHandler(async (req,res) => {
    await User.findByIdAndUpdate(req.user._id,
        {
            $set: {refreshToken: null}
        },
        {new: true}
    )

    const options = {
        httpOnly: true,
        secure: true
    }
    
    return res.status(200).clearCookie("accessToken", options).clearCookie("refreshToken", options)
    .json(new ApiResponse(200,null,"User logged out successfully"))
})

export {registerUser,loginUser,logoutUser}