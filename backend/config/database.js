'use strict'

require('dotenv').config()

const dbPassword = process.env.DB_PASS || process.env.DB_PASSWORD || 'postgres'

module.exports = {
  development: {
    username: process.env.DB_USER || 'postgres',
    password: dbPassword,
    database: process.env.DB_NAME || 'fbr_invoicing',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    dialect: 'postgres',
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
      paranoid: false, // soft delete handled per-model via deletedAt
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  },
  test: {
    username: process.env.DB_USER || 'postgres',
    password: dbPassword,
    database: process.env.DB_NAME_TEST || 'fbr_invoicing_test',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    dialect: 'postgres',
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASS || process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5433', 10),
    dialect: 'postgres',
    logging: false,
    define: {
      underscored: true,
      timestamps: true,
    },
    pool: {
      max: 20,
      min: 2,
      acquire: 30000,
      idle: 10000,
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
}
