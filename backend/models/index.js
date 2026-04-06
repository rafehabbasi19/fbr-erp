'use strict'

const { Sequelize, DataTypes } = require('sequelize')
const path = require('path')
const fs = require('fs')
const dbConfig = require('../config/database')

const env = process.env.APP_ENV || process.env.NODE_ENV || 'development'
const config = dbConfig[env]

const sequelize = new Sequelize(config.database, config.username, config.password, config)

const db = {}

// Auto-load all model files in this directory (except index.js)
fs.readdirSync(__dirname)
  .filter(file => file !== 'index.js' && file.endsWith('.js'))
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes)
    db[model.name] = model
  })

// Run associations
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db)
  }
})

db.sequelize = sequelize
db.Sequelize = Sequelize

module.exports = db
