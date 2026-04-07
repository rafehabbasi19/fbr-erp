'use strict'

const { Router } = require('express')
const { body, param } = require('express-validator')

const authController = require('../controllers/authController')

const router = Router()

router.post(
  '/register',
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage('Name is required')
      .isLength({ max: 100 })
      .withMessage('Name must not exceed 100 characters'),
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Email must be valid')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Password is required')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters'),
    body('password_confirmation')
      .notEmpty()
      .withMessage('Password confirmation is required')
      .custom((value, { req }) => value === req.body.password)
      .withMessage('Password confirmation does not match'),
    body('company_name').trim().notEmpty().withMessage('Company name is required'),
  ],
  authController.register
)

router.get(
  '/verify-email/:token',
  [
    param('token')
      .trim()
      .notEmpty()
      .withMessage('Verification token is required')
      .isUUID()
      .withMessage('Verification token must be a valid UUID'),
  ],
  authController.verifyEmail
)

router.post(
  '/resend-verification',
  [
    body('email')
      .trim()
      .notEmpty()
      .withMessage('Email is required')
      .isEmail()
      .withMessage('Email must be valid')
      .normalizeEmail(),
  ],
  authController.resendVerification
)

module.exports = router
