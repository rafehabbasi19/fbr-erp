'use strict'

module.exports = (sequelize, DataTypes) => {
  const Company = sequelize.define(
    'Company',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(255), allowNull: false },
      ntn: { type: DataTypes.STRING(20), allowNull: true },
      strn: { type: DataTypes.STRING(20), allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      logo_url: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'companies', underscored: true }
  )

  Company.associate = db => {
    Company.hasMany(db.User, { foreignKey: 'company_id', as: 'users' })
    Company.hasMany(db.Client, { foreignKey: 'company_id', as: 'clients' })
    Company.hasMany(db.Invoice, { foreignKey: 'company_id', as: 'invoices' })
    Company.hasMany(db.TaxRate, { foreignKey: 'company_id', as: 'taxRates' })
    Company.hasOne(db.CompanySetting, { foreignKey: 'company_id', as: 'settings' })
    Company.hasOne(db.FbrToken, { foreignKey: 'company_id', as: 'fbrToken' })
    Company.hasMany(db.AuditLog, { foreignKey: 'company_id', as: 'auditLogs' })
    Company.hasMany(db.Notification, { foreignKey: 'company_id', as: 'notifications' })
  }

  return Company
}
