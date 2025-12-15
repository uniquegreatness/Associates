// supabase-secure-backend/routes/groupsRouter.js

const express = require('express');
const router = express.Router();

// =================================================================
// Import all new Group Management Endpoints
// Note: Paths are relative to the current file location (./groups/)
// =================================================================
const createGroup = require('./groups/createGroup');
const getAllGroups = require('./groups/getAllGroups');
const getGroupStatus = require('./groups/getGroupStatus');
const joinGroup = require('./groups/joinGroup');
const downloadVCF = require('./groups/directVCFdownload'); // Renamed to VCFDownload for clarity here
const closeGroup = require('./groups/closeGroup');


// =================================================================
// Mount Endpoints
// =================================================================

// 1. Group Creation and Management
router.use('/create', createGroup);
router.use('/close', closeGroup);

// 2. Read Endpoints
// The base path (/) will typically fetch all groups
router.use('/', getAllGroups); 
router.use('/status', getGroupStatus);

// 3. Action Endpoints
router.use('/join', joinGroup);
router.use('/download', downloadVCF);


module.exports = router;
