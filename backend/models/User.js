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
      company_id: { type: DataTypes.UUID, allowNull: true },
      role_id: { type: DataTypes.UUID, allowNull: true },
      name: { type: DataTypes.STRING(255), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      role: {
        type: DataTypes.ENUM('admin', 'super_admin', 'company_admin', 'seller', 'accountant'),
        allowNull: false,
        defaultValue: 'seller',
      },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      email_verified_at: { type: DataTypes.DATE, allowNull: true },
      last_login_at: { type: DataTypes.DATE, allowNull: true },
      password_changed_at: { type: DataTypes.DATE, allowNull: true },
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
    if (db.Role) {
      User.belongsTo(db.Role, { foreignKey: 'role_id', as: 'roleDefinition' })
    }
    if (db.RoleUser) {
      User.hasMany(db.RoleUser, { foreignKey: 'user_id', as: 'roleAssignments' })
    }
    if (db.EmailVerificationToken) {
      User.hasMany(db.EmailVerificationToken, {
        foreignKey: 'user_id',
        as: 'emailVerificationTokens',
      })
    }
    User.hasMany(db.RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens' })
    User.hasMany(db.Invoice, { foreignKey: 'created_by', as: 'createdInvoices' })
    User.hasMany(db.AuditLog, { foreignKey: 'user_id', as: 'auditLogs' })
    User.hasMany(db.Notification, { foreignKey: 'user_id', as: 'notifications' })
  }

  return User
}
