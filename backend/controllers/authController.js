import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Helper function to validate occupation
const isValidOccupation = (occupation) => {
    const validOccupations = ['farmer', 'researcher', 'government_official', 'student', 'ngo_worker', 'other'];
    return validOccupations.includes(occupation);
};

// Sign Up Controller
export const signup = async (req, res) => {
    try {
        const {
            username,
            password,
            occupation,
            location
        } = req.body;

        // Validation
        if (!username || !password |occ| !upation) {
            return res.status(400).json({
                success: false,
                message: 'Username, password, and occupation are required'
            });
        }

        // Validate occupation
        if (!isValidOccupation(occupation)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid occupation. Must be one of: farmer, researcher, government_official, student, ngo_worker, other'
            });
        }

        // Check if user already exists
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('user_id, username')
            .eq('username', username)
            .single();

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'User with this username already exists'
            });
        }

        // Hash password
        const saltRounds = 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        // Prepare user data
        const userData = {
            username,
            password_hash: passwordHash,
            occupation,
            location: location || null
        };

        // Insert user into database
        const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert([userData])
            .select('user_id, username, occupation, location')
            .single();

        if (insertError) {
            console.error('Database insert error:', insertError);
            return res.status(500).json({
                success: false,
                message: 'Failed to create user account'
            });
        }

        // Return success response
        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            user: {
                user_id: newUser.user_id,
                username: newUser.username,
                occupation: newUser.occupation,
                location: newUser.location
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during registration'
        });
    }
};

// Sign In Controller
export const signin = async (req, res) => {
    try {
        const { username, password } = req.body;

        // Validation
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                message: 'Username and password are required'
            });
        }

        // Find user by username
        const { data: user, error: fetchError } = await supabase
            .from('users')
            .select('user_id, username, password_hash, occupation, location')
            .eq('username', username)
            .single();

        if (fetchError || !user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username'
            });
        }

        // Verify password
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid password'
            });
        }

        // Return success response
        res.status(200).json({
            success: true,
            message: 'Login successful',
            user: {
                user_id: user.user_id,
                username: user.username,
                occupation: user.occupation,
                location: user.location
            }
        });

    } catch (error) {
        console.error('Signin error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error during login'
        });
    }
};
