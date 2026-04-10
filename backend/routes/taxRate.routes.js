'use strict'

const { Router } = require('express')
const { body, param, query } = require('express-validator')

const taxRateController = require('../controllers/taxRateController')
const { requirePermission, requireRole } = require('../middleware/rbac')
const { PERMISSIONS } = require('../config/rbacMatrix')

const router = Router()

const readableRoles = ['super_admin', 'admin', 'company_admin', 'seller', 'accountant']

const taxRateIdParam = [
  param('id').isUUID().withMessage('Tax rate id must be a valid UUID'),
]

const listValidators = [
  query('include_inactive')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['1', 'true', 'yes', '0', 'false', 'no'])
    .withMessage('Include inactive must be a boolean-like value'),
]

const createValidators = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name must not exceed 100 characters'),
  body('rate_percentage')
    .isFloat({ min: 0, max: 100 })
    .withMessage('Rate percentage must be between 0 and 100'),
  body('tax_type')
    .optional({ checkFalsy: true })
    .isIn(['GST', 'SalesTax', 'WHT', 'Exempt', 'ZeroRated'])
    .withMessage('Tax type is invalid'),
  body('description')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Description must not exceed 255 characters'),
  body('is_default')
    .optional({ nullable: true })
    .isBoolean()
    .withMessage('Is default must be a boolean')
    .toBoolean(),
  body('is_active')
    .optional({ nullable: true })
    .isBoolean()
    .withMessage('Is active must be a boolean')
    .toBoolean(),
]

const updateValidators = [
  ...taxRateIdParam,
  body('name')
    .optional({ nullable: true, checkFalsy: false })
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name must be between 1 and 100 characters'),
  body('rate_percentage')
    .optional({ nullable: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('Rate percentage must be between 0 and 100'),
  body('tax_type')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['GST', 'SalesTax', 'WHT', 'Exempt', 'ZeroRated'])
    .withMessage('Tax type is invalid'),
  body('description')
    .optional({ nullable: true, checkFalsy: false })
    .trim()
    .isLength({ max: 255 })
    .withMessage('Description must not exceed 255 characters'),
  body('is_default')
    .optional({ nullable: true })
    .isBoolean()
    .withMessage('Is default must be a boolean')
    .toBoolean(),
  body('is_active')
    .optional({ nullable: true })
    .isBoolean()
    .withMessage('Is active must be a boolean')
    .toBoolean(),
]

const previewValidators = [
  body('client_id')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID()
    .withMessage('Client id must be a valid UUID'),
  body('issue_date')
    .optional({ nullable: true, checkFalsy: true })
    .isISO8601()
    .withMessage('Issue date must be a valid date'),
  body('discount_type')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isIn(['percentage', 'fixed'])
    .withMessage('Discount type must be either percentage or fixed'),
  body('discount_value')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Discount value must be a non-negative number'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one item is required'),
  body('items.*.description')
    .trim()
    .notEmpty()
    .withMessage('Item description is required')
    .isLength({ max: 500 })
    .withMessage('Item description must not exceed 500 characters'),
  body('items.*.quantity')
    .isFloat({ gt: 0 })
    .withMessage('Item quantity must be greater than 0'),
  body('items.*.unit')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Item unit must not exceed 50 characters'),
  body('items.*.unit_price')
    .isFloat({ min: 0 })
    .withMessage('Item unit price must be a non-negative number'),
  body('items.*.tax_rate_id')
    .optional({ nullable: true, checkFalsy: true })
    .isUUID()
    .withMessage('Item tax rate id must be a valid UUID'),
  body('items.*.tax_rate_percentage')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0, max: 100 })
    .withMessage('Item tax rate percentage must be between 0 and 100'),
  body('items.*.price_includes_tax')
    .optional({ nullable: true })
    .isBoolean()
    .withMessage('Item price includes tax flag must be a boolean')
    .toBoolean(),
  body('items.*.sort_order')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0 })
    .withMessage('Item sort order must be a non-negative integer'),
]

router.get('/', requireRole(readableRoles), listValidators, taxRateController.listTaxRates)

router.post(
  '/preview',
  requirePermission(PERMISSIONS.CREATE_EDIT_INVOICES),
  previewValidators,
  taxRateController.previewTaxCalculation
)

router.post(
  '/',
  requirePermission(PERMISSIONS.MANAGE_TAX_RATES),
  createValidators,
  taxRateController.createTaxRate
)

router.put(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_TAX_RATES),
  updateValidators,
  taxRateController.updateTaxRate
)

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.MANAGE_TAX_RATES),
  taxRateIdParam,
  taxRateController.deleteTaxRate
)

module.exports = router
