import express from 'express';
import { signup, signin } from '../controllers/authController.js';

const router = express.Router();

// Simple auth routes - no tokens needed for now
router.post('/signup', signup);
router.post('/signin', signin);

export default router;
