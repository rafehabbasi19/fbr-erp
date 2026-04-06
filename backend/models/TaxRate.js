'use strict'

module.exports = (sequelize, DataTypes) => {
  const TaxRate = sequelize.define(
    'TaxRate',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false },
      label: { type: DataTypes.STRING(50), allowNull: false },
      rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'tax_rates', underscored: true }
  )

  TaxRate.associate = db => {
    TaxRate.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
  }

  return TaxRate
}
