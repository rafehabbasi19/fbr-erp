'use strict'

const { Router } = require('express')
const { body, param, query } = require('express-validator')

const invoiceController = require('../controllers/invoiceController')
const { requireRole, requirePermission } = require('../middleware/rbac')
const { PERMISSIONS } = require('../config/rbacMatrix')

const router = Router()

const invoiceBodyValidators = [
  body('client_id').isUUID().withMessage('Client id must be a valid UUID'),
  body('issue_date').isISO8601().withMessage('Issue date must be a valid date'),
  body('due_date').isISO8601().withMessage('Due date must be a valid date'),
  body('currency')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 3, max: 10 })
    .withMessage('Currency must be between 3 and 10 characters'),
  body('discount_type')
    .optional({ nullable: true, checkFalsy: true })
    .trim()
    .isIn(['percentage', 'fixed'])
    .withMessage('Discount type must be either percentage or fixed'),
  body('discount_value')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Discount value must be a non-negative number'),
  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Notes must not exceed 5000 characters'),
  body('terms')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Terms must not exceed 5000 characters'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one invoice item is required'),
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
  body('items.*.sort_order')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0 })
    .withMessage('Item sort order must be a non-negative integer'),
]

const listValidators = [
  query('status')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled'])
    .withMessage('Status filter is invalid'),
  query('client_id').optional({ checkFalsy: true }).isUUID().withMessage('Client id must be a valid UUID'),
  query('seller_id').optional({ checkFalsy: true }).isUUID().withMessage('Seller id must be a valid UUID'),
  query('date_from')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Date from must be a valid date'),
  query('date_to')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Date to must be a valid date'),
  query('amount_min')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Amount min must be a non-negative number'),
  query('amount_max')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Amount max must be a non-negative number'),
  query('search')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 120 })
    .withMessage('Search term must not exceed 120 characters'),
  query('page')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('per_page')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 100 })
    .withMessage('Per page must be between 1 and 100')
    .toInt(),
  query('sort_by')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['invoice_number', 'issue_date', 'due_date', 'status', 'total', 'amount_paid', 'created_at'])
    .withMessage('Sort by value is invalid'),
  query('sort_dir')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['asc', 'desc', 'ASC', 'DESC'])
    .withMessage('Sort direction must be asc or desc'),
]

const idParamValidator = [
  param('id').isUUID().withMessage('Invoice id must be a valid UUID'),
]

const cancelBodyValidators = [
  body('reason')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Cancel reason must not exceed 1000 characters'),
]

const readableRoles = ['super_admin', 'admin', 'company_admin', 'seller', 'accountant']

router.get('/', requireRole(readableRoles), listValidators, invoiceController.listInvoices)
router.get('/:id', requireRole(readableRoles), idParamValidator, invoiceController.getInvoiceById)
router.get('/:id/pdf', requireRole(readableRoles), idParamValidator, invoiceController.getInvoicePdf)

router.post(
  '/',
  requirePermission(PERMISSIONS.CREATE_EDIT_INVOICES),
  invoiceBodyValidators,
  invoiceController.createInvoice
)

router.put(
  '/:id',
  requirePermission(PERMISSIONS.CREATE_EDIT_INVOICES),
  [...idParamValidator, ...invoiceBodyValidators],
  invoiceController.updateInvoice
)

router.delete(
  '/:id',
  requirePermission(PERMISSIONS.DELETE_INVOICES),
  idParamValidator,
  invoiceController.deleteInvoice
)

router.post(
  '/:id/duplicate',
  requirePermission(PERMISSIONS.CREATE_EDIT_INVOICES),
  idParamValidator,
  invoiceController.duplicateInvoice
)

router.post(
  '/:id/send',
  requirePermission(PERMISSIONS.CREATE_EDIT_INVOICES),
  idParamValidator,
  invoiceController.sendInvoice
)

router.post(
  '/:id/cancel',
  requirePermission(PERMISSIONS.CREATE_EDIT_INVOICES),
  [...idParamValidator, ...cancelBodyValidators],
  invoiceController.cancelInvoice
)

module.exports = router
