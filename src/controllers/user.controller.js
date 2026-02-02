import {asyncHandler} from '../utils/asyncHandler.js';
import {ApiError} from '../utils/ApiError.js';
import {User} from '../models/user.model.js'
import {uploadOnCloudinary} from '../utils/cloudinary.js'
import {ApiResponse} from '../utils/ApiResponse.js'

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

    const avatarUrl = await uploadOnCloudinary(avatarLocalPath)
    const coverImageUrl = await uploadOnCloudinary(coverImageLocalPath)

    if(!avatarUrl){
        throw new ApiError(500,"Error uploading avatar image")
    }

    const user = await User.create({
        fullname,
        avatar: avatarUrl.url,
        coverImage: coverImageUrl?.url || "",
        email,
        username: username.toLowerCase(),
    })

    const createdUser = await User.findById(user._id).select('-password -refreshToken')
    if(!createdUser){
        throw new ApiError(500,"Error creating user")
    }

    return res.status(201).json(new ApiResponse(200,createdUser,"User registered successfully"))
})

export {registerUser}