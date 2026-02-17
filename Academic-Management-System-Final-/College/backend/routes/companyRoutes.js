import express from 'express';
const router = express.Router();
import * as companyController from '../controllers/companyController.js';
// Routes for companies
// Frontend should call: /api/companies   (camelCase plural)
router.get('/', companyController.getAllCompanies);
router.get('/:id', companyController.getCompanyById);
router.post('/', companyController.createCompany);
router.put('/:id', companyController.updateCompany);
router.delete('/:id', companyController.deleteCompany);

export default router;