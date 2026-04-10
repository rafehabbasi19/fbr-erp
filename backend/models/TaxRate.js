'use strict'

const { Op } = require('sequelize')

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
      name: { type: DataTypes.STRING(100), allowNull: false },
      rate_percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
      tax_type: {
        type: DataTypes.ENUM('GST', 'SalesTax', 'WHT', 'Exempt', 'ZeroRated'),
        allowNull: false,
        defaultValue: 'GST',
      },
      description: { type: DataTypes.STRING(255), allowNull: true },
      is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // Backward-compatible aliases for legacy callers.
      label: {
        type: DataTypes.VIRTUAL,
        get() {
          return this.getDataValue('name')
        },
        set(value) {
          this.setDataValue('name', value)
        },
      },
      rate: {
        type: DataTypes.VIRTUAL,
        get() {
          return this.getDataValue('rate_percentage')
        },
        set(value) {
          this.setDataValue('rate_percentage', value)
        },
      },
    },
    { tableName: 'tax_rates', underscored: true }
  )

  TaxRate.addHook('beforeSave', 'ensureSingleDefaultPerCompany', async (instance, options) => {
    if (!instance.company_id || !instance.is_default) {
      return
    }

    await TaxRate.update(
      { is_default: false },
      {
        where: {
          company_id: instance.company_id,
          id: { [Op.ne]: instance.id || null },
        },
        transaction: options.transaction,
      }
    )
  })

  TaxRate.associate = db => {
    TaxRate.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
    if (db.InvoiceItem) {
      TaxRate.hasMany(db.InvoiceItem, { foreignKey: 'tax_rate_id', as: 'invoiceItems' })
    }
  }

  return TaxRate
}
