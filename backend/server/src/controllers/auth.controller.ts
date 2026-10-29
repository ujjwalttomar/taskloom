
import {Request, Response , NextFunction} from "express";
import { OAuth2Client } from "google-auth-library";
import {signAccessToken, generateRefreshToken} from "../../../shared/auth/token";
import prisma from "../../../shared/db/client"

const isProduction = process.env.NODE_ENV === "production";

// Shared cookie options — used for both set and clear so attributes always match
const cookieBase = {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? "none" : "lax") as "none" | "lax",
};

let client: OAuth2Client;   // just a declaration, nothing created yet

function getOAuthClient() {
    if (!client) {
        client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI,
        );
    }
    return client;
}

export const redirectToGoogle = (req: Request, res: Response ,next: NextFunction)=>{
    
    const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    scope: "email profile",
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);

}

export const handleGoogleCallback = async(req: Request, res: Response ,next: NextFunction)=>{
    try{
        
        const code = req.query.code?.toString();
        if (!code) {
            res.status(400).json({ error: "Authorization code missing" });
            return;
        }

        const {tokens} = await getOAuthClient().getToken(code);

        const ticket = await getOAuthClient().verifyIdToken({
            idToken: tokens.id_token!,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const googleUser = ticket.getPayload();

        if (!googleUser?.email || !googleUser?.name) {
            res.status(400).json({ error: "Google account missing required info" });
            return;
        }

        let user = await prisma.user.findUnique({
            where :{
                email : googleUser.email
            }
        });

        if(!user){
            user = await prisma.user.create({
                data : {
                    email : googleUser.email!,
                    name : googleUser.name!,
                    googleId : googleUser.sub,
                },
            });
        }

        const accessToken = signAccessToken(user.id);
        const refreshToken = generateRefreshToken();

        await prisma.refreshToken.create({
            data :{
                token : refreshToken,
                userId : user.id,
                expiresAt : new Date(Date.now() + 7*24*60*60*1000)
            },
        });

        res.cookie("accessToken", accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });
        res.cookie("refreshToken", refreshToken, { ...cookieBase, maxAge: 7 * 24 * 60 * 60 * 1000 });

        res.redirect(`${process.env.FRONTEND_URL}/dashboard`);
    }catch(error: any){
        console.error("handleGoogleCallback error:", error.message ?? error);
        res.status(500).json({message : "server side error!", error: error.message});
    }
}

export const refreshAccessToken = async(req: Request, res: Response ,next: NextFunction)=>{
    try{
        const token = req.cookies.refreshToken;

        if(!token)return res.status(401).json({error : "No refresh token!"});

        const refreshToken = await prisma.refreshToken.findUnique({
            where: {
                token : token
            }
        });
        if(!refreshToken){
            return res.status(401).json({error : "Invalid refresh token"})
        }

        if(refreshToken.expiresAt <= new Date()){
            await prisma.refreshToken.delete({where : {token : token}});
            res.clearCookie("accessToken", cookieBase);
            res.clearCookie("refreshToken", cookieBase);
            return res.status(401).json({ error: "Refresh token expired" });
        }

        const userId = refreshToken.userId;

        const accessToken = signAccessToken(userId);

        res.cookie("accessToken", accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });

        res.status(200).json({message : "token refreshed!"});

    }catch(error: any){
        console.error("refreshAccessToken error:", error.message ?? error);
        return res.status(500).json({message : "server side error!", error: error.message});
    }
}


export const getCurrentUser = async (req: Request, res: Response) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: {
                id: true,
                name: true,
                email: true,
                googleId: true,
                createdAt: true,
            },
        });

        if (!user) return res.status(404).json({ message: "User not found" });

        return res.status(200).json({ user });

    } catch (error: any) {
        console.error("getCurrentUser error:", error.message ?? error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};


export const logoutUser = async(req: Request, res: Response ,next: NextFunction)=>{
    try{
        const token = req.cookies.refreshToken;

        if (token) {
        await prisma.refreshToken.delete({ where: { token } }).catch(() => {});
        // .catch(() => {}) — if token doesn't exist in DB, ignore the error
        }

        res.clearCookie("accessToken", cookieBase);
        res.clearCookie("refreshToken", cookieBase);
        res.status(200).json({message : "logged out successfully!"});
    }catch(error: any){
        console.error("logoutUser error:", error.message ?? error);
        return res.status(500).json({message : "server side error!", error: error.message});
    }
}
