import express from 'express';
const router = express.Router();
import * as userController from '../controllers/userController.js';
// Routes for users
// Frontend should call: /api/users
router.get('/', userController.getAllUsers);
router.get('/getCompany/:userNumber', userController.getCompanyByUserNumber);
router.get('/getDepartment/:userNumber', userController.getDepartmentByUserNumber);
router.get('/:id', userController.getUserById);
router.post('/', userController.createUser);
router.put('/:id', userController.updateUser);
router.delete('/:id', userController.deleteUser);

export default router;