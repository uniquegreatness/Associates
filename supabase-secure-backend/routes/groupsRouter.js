// supabase-secure-backend/routes/groupsRouter.js
const express = require('express');
const router = express.Router();

// =================================================================
// Middleware
// =================================================================
const { requireUserAuth } = require('../middleware/authMiddleware'); 
// requireUserAuth verifies the token from the frontend and populates req.user

// =================================================================
// Import all Group Management Endpoints
// Paths are relative to this file
// =================================================================
const createGroup = require('./groups/createGroup');
const getAllGroups = require('./groups/getAllGroups');
const getGroupStatus = require('./groups/getGroupStatus');
const joinGroup = require('./groups/joinGroup');
const downloadVCF = require('./groups/directVCFdownload'); 
const closeGroup = require('./groups/closeGroup');

// =================================================================
// Apply User Auth Middleware to Sensitive Endpoints
// =================================================================
// All actions that modify or download data require a valid user
router.use(['/create', '/join', '/close', '/download'], requireUserAuth);

// =================================================================
// Mount Endpoints
// =================================================================

// 1. Group Creation and Management
// Hybrid: creator_user_id is enforced from req.user.id inside createGroup
router.use('/create', createGroup);
router.use('/close', closeGroup);

// 2. Read Endpoints (can be public or require auth depending on design)
router.use('/', getAllGroups); 
router.use('/status', getGroupStatus);

// 3. Action Endpoints
router.use('/join', joinGroup);
router.use('/download', downloadVCF);

module.exports = router;
