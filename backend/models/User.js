'use strict'

module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(255), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      role: {
        type: DataTypes.ENUM('admin', 'seller'),
        allowNull: false,
        defaultValue: 'seller',
      },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      failed_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      locked_until: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'users',
      underscored: true,
      defaultScope: {
        attributes: { exclude: ['password_hash'] },
      },
      scopes: {
        withPassword: { attributes: {} }, // include all fields
      },
    }
  )

  User.associate = db => {
    User.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
    User.hasMany(db.RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' })
    User.hasMany(db.Invoice, { foreignKey: 'created_by', as: 'createdInvoices' })
    User.hasMany(db.AuditLog, { foreignKey: 'user_id', as: 'auditLogs' })
    User.hasMany(db.Notification, { foreignKey: 'user_id', as: 'notifications' })
  }

  return User
}
