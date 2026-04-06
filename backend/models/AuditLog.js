'use strict'

module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define(
    'AuditLog',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: true },
      action: { type: DataTypes.STRING(100), allowNull: false },
      entity_type: { type: DataTypes.STRING(50), allowNull: true },
      entity_id: { type: DataTypes.UUID, allowNull: true },
      old_values: { type: DataTypes.JSONB, allowNull: true },
      new_values: { type: DataTypes.JSONB, allowNull: true },
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
    },
    { tableName: 'audit_logs', underscored: true, updatedAt: false }
  )

  AuditLog.associate = db => {
    AuditLog.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
    AuditLog.belongsTo(db.User, { foreignKey: 'user_id', as: 'user' })
  }

  return AuditLog
}
