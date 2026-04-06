'use strict'

module.exports = (sequelize, DataTypes) => {
  const CompanySetting = sequelize.define(
    'CompanySetting',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false, unique: true },
      invoice_prefix: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'INV' },
      invoice_counter: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      invoice_format: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: '{PREFIX}-{YYYY}-{NNNN}',
      },
      payment_terms_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
    },
    { tableName: 'company_settings', underscored: true }
  )

  CompanySetting.associate = db => {
    CompanySetting.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
  }

  return CompanySetting
}
