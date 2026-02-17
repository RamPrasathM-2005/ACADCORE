import express from 'express';
const router = express.Router();
import * as roleController from '../controllers/roleController.js';
// Routes for roles
// Frontend should call: /api/roles
router.get('/', roleController.getAllRoles);
router.get('/:id', roleController.getRoleById);
router.post('/', roleController.createRole);
router.put('/:id', roleController.updateRole);
router.delete('/:id', roleController.deleteRole);

export default router;