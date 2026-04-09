'use strict'

const { Router } = require('express')
const { body, param, query } = require('express-validator')

const clientController = require('../controllers/clientController')
const { requireRole } = require('../middleware/rbac')

const router = Router()

const clientPayloadValidators = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 200 })
    .withMessage('Name must not exceed 200 characters'),
  body('client_type')
    .trim()
    .notEmpty()
    .withMessage('Client type is required')
    .isIn(['individual', 'business'])
    .withMessage('Client type must be either individual or business')
    .custom((value, { req }) => {
      const clientType = String(value || '').trim().toLowerCase()
      const cnic = String(req.body.cnic || '').trim()

      if (clientType === 'individual' && !cnic) {
        throw new Error('CNIC is required for individual clients')
      }

      return true
    }),
  body('email')
    .optional({ checkFalsy: true })
    .trim()
    .isEmail()
    .withMessage('Email must be valid')
    .normalizeEmail(),
  body('ntn')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^\d{7}$/)
    .withMessage('NTN must contain exactly 7 digits')
    .bail()
    .custom((value, { req }) => {
      const ntn = String(value || '').trim()
      const cnic = String(req.body.cnic || '').trim()

      if (!ntn && !cnic) {
        throw new Error('At least one of NTN or CNIC must be provided')
      }

      return true
    }),
  body('cnic')
    .optional({ checkFalsy: true })
    .trim()
    .matches(/^\d{13}$/)
    .withMessage('CNIC must contain exactly 13 digits without dashes'),
  body('phone')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 30 })
    .withMessage('Phone must not exceed 30 characters'),
  body('address')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Address must not exceed 1000 characters'),
  body('city')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('City must not exceed 100 characters'),
  body('province')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Province must not exceed 100 characters'),
  body('postal_code')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 20 })
    .withMessage('Postal code must not exceed 20 characters'),
  body('country')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Country must not exceed 100 characters'),
  body('strn')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 50 })
    .withMessage('STRN must not exceed 50 characters'),
  body('credit_limit')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('Credit limit must be a non-negative number'),
  body('payment_terms_days')
    .optional({ checkFalsy: true })
    .isInt({ min: 0, max: 3650 })
    .withMessage('Payment terms days must be an integer between 0 and 3650'),
  body('notes')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 5000 })
    .withMessage('Notes must not exceed 5000 characters'),
  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['active', 'inactive'])
    .withMessage('Status must be either active or inactive'),
  body('cnic').custom((value, { req }) => {
    const ntn = String(req.body.ntn || '').trim()
    const cnic = String(value || '').trim()

    if (!ntn && !cnic) {
      throw new Error('At least one of NTN or CNIC must be provided')
    }

    return true
  }),
]

const listQueryValidators = [
  query('search')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Search term must not exceed 200 characters'),
  query('type')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['individual', 'business'])
    .withMessage('Type must be either individual or business'),
  query('status')
    .optional({ checkFalsy: true })
    .trim()
    .isIn(['active', 'inactive'])
    .withMessage('Status must be either active or inactive'),
  query('page')
    .optional({ checkFalsy: true })
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),
  query('per_page')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 100 })
    .withMessage('Per page must be an integer between 1 and 100')
    .toInt(),
]

const idParamValidator = [
  param('id').isUUID().withMessage('Client id must be a valid UUID'),
]

router.use(requireRole(['super_admin', 'admin', 'company_admin', 'seller']))

router.post('/', clientPayloadValidators, clientController.createClient)
router.get('/', listQueryValidators, clientController.listClients)
router.get('/:id', idParamValidator, clientController.getClientById)
router.put('/:id', [...idParamValidator, ...clientPayloadValidators], clientController.updateClient)
router.delete('/:id', idParamValidator, clientController.deleteClient)

module.exports = router
