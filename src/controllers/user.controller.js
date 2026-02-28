import {asyncHandler} from '../utils/asyncHandler.js';
import {ApiError} from '../utils/ApiError.js';
import {User} from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import {ApiResponse} from '../utils/ApiResponse.js'
import jwt from 'jsonwebtoken'

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

const refreshAccessToken = asyncHandler(async (req,res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(400,"Refresh token is required")
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET)
        const user = await User.findById(decodedToken?._id)
        if(!user){
            throw new ApiError(401,"Unauthorized")
        }
    
        if(incomingRefreshToken !== user.refreshToken){
            throw new ApiError(401,"Unauthorized")
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newrefreshToken} = await generateAccessAndRefreshTokens(user._id)
    
        return res.status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", newrefreshToken, options)
        .json(new ApiResponse(200,{
            accessToken,
            refreshToken: newrefreshToken
        },"Access token refreshed successfully"))
    } catch (error) {
        throw new ApiError(401,"Invalid refresh token")
    }
})

const changeCurrentPassword = asyncHandler(async (req,res) => {
    const {oldPassword, newPassword} = req.body

    const user = await User.findById(req.user._id)
    const isOldPasswordCorrect = await user.isPasswordCorrect(oldPassword)
    if(!isOldPasswordCorrect){
        throw new ApiError(401,"Old password is incorrect")
    }

    user.password = newPassword
    await user.save({validateBeforeSave: true})

    return res.status(200).json(new ApiResponse(200,null,"Password changed successfully"))
})

const getCurrentUser = asyncHandler(async (req,res) => {
    return res.status(200).json(new ApiResponse(200,req.user,"current user fetched successfully"))
})

const updateAccountDetails = asyncHandler(async (req,res) => {
    const {fullName, email} = req.body
    if(!fullName && !email){
        throw new ApiError(400,"At least one field is required to update")
    }

    const user = await User.findByIdAndUpdate(req.user._id,{$set:{fullName,email}},{new: true}).select("-password")
    return res.status(200).json(new ApiResponse(200,user,"Account details updated successfully"))
})

const updateUserAvatar = asyncHandler(async (req,res) => {
    const avatarLocalPath = req.file?.path
    if(!avatarLocalPath){
        throw new ApiError(400,"Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    if(!avatar.url){
        throw new ApiError(400,"Failed to upload avatar")
    }

    const user = await User.findByIdAndUpdate(req.user._id,{$set:{avatar: avatar.url}},{new: true}).select("-password")
    return res.status(200).json(new ApiResponse(200,user,"Avatar updated successfully"))
})

const updateUserCoverImage = asyncHandler(async (req,res) => {
    const coverImageLocalPath = req.file?.path
    if(!coverImageLocalPath){
        throw new ApiError(400,"Cover image file is required")
    }
    
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)
    if(!coverImage.url){
        throw new ApiError(400,"Failed to upload cover image")
    }

    const user = await User.findByIdAndUpdate(req.user._id,{$set:{coverImage: coverImage.url}},{new: true}).select("-password")
    return res.status(200).json(new ApiResponse(200,user,"Cover image updated successfully"))
})

export {registerUser,loginUser,logoutUser,refreshAccessToken,changeCurrentPassword,getCurrentUser,updateAccountDetails,updateUserAvatar,updateUserCoverImage}