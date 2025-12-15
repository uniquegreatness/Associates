// routes/apiRoutes.js (UPDATED MAIN FILE)
const express = require('express');
const router = express.Router();

// =================================================================
// 0. NEW GROUP MANAGEMENT ROUTES (The new addition)
// =================================================================
const groupsRouter = require('./groupsRouter'); // <<< NEW IMPORT

// =================================================================
// 1. AUTH ROUTES
// =================================================================
const tokenSignIn = require('./auth/tokenSignIn');

// =================================================================
// 2. FRONTEND INTEGRATION ROUTES (Fixes/Simpler Routes)
// =================================================================
const secureDataLeaderboard = require('./frontend/secureDataLeaderboard');
const getCohortStatusFix = require('./frontend/getCohortStatusFix');
const joinClusterFix = require('./frontend/joinClusterFix');
const getClusterStatsFix = require('./frontend/getClusterStatsFix');
const clusterStatsV2 = require('./frontend/clusterStatsV2'); 
const downloadVCFStream = require('./frontend/downloadVCFStream');
const trackDownload = require('./frontend/trackDownload');

// =================================================================
// 3. LEGACY/ORIGINAL ROUTES (Backward Compatibility)
// =================================================================
const getCohortStatusLegacy = require('./legacy/getCohortStatusLegacy');
const joinClusterLegacy = require('./legacy/joinClusterLegacy');
const leaveClusterLegacy = require('./legacy/leaveClusterLegacy');
const getLeaderboardLegacy = require('./legacy/getLeaderboardLegacy');
const getDisplayMemberList = require('./legacy/getDisplayMemberList'); 

// =================================================================
// 4. ADMIN ROUTES (Secure Endpoints)
// =================================================================
const downloadVcfAdmin = require('./admin/downloadVcfAdmin');
const getVcfStatusAdmin = require('./admin/getVcfStatusAdmin');
const getFullMemberListAdmin = require('./admin/getFullMemberListAdmin');
const getClusterStatsAdmin = require('./admin/getClusterStatsAdmin');
const requestVcfUpload = require('./admin/requestVcfUpload');
const commitVcfUpload = require('./admin/commitVcfUpload');


// =================================================================
// ROUTE MOUNTING (The order here does not matter)
// =================================================================

// 🛑 NEW GROUP ROUTES MOUNTED HERE
router.use('/groups', groupsRouter); // <<< MOUNTED AT /api/groups

// AUTH
router.use('/', tokenSignIn);

// FRONTEND INTEGRATION
router.use('/', secureDataLeaderboard);
router.use('/', getCohortStatusFix);
router.use('/', joinClusterFix);
router.use('/', getClusterStatsFix);
router.use('/', clusterStatsV2); 
router.use('/', downloadVCFStream);
router.use('/', trackDownload);

// LEGACY ROUTES
router.use('/', getCohortStatusLegacy);
router.use('/', joinClusterLegacy);
router.use('/', leaveClusterLegacy);
router.use('/', getLeaderboardLegacy);
router.use('/', getDisplayMemberList);

// ADMIN ROUTES
router.use('/', downloadVcfAdmin);
router.use('/', getVcfStatusAdmin);
router.use('/', getFullMemberListAdmin);
router.use('/', getClusterStatsAdmin);
router.use('/', requestVcfUpload);
router.use('/', commitVcfUpload);


module.exports = router;

