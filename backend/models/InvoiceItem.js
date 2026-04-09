'use strict'

module.exports = (sequelize, DataTypes) => {
  const InvoiceItem = sequelize.define(
    'InvoiceItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      invoice_id: { type: DataTypes.UUID, allowNull: false },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      description: { type: DataTypes.STRING(500), allowNull: false },
      unit: { type: DataTypes.STRING(50), allowNull: true },
      tax_rate_id: { type: DataTypes.UUID, allowNull: true },
      tax_rate_percentage: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      line_total: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      product_name: { type: DataTypes.STRING(255), allowNull: false },
      hsn_code: { type: DataTypes.STRING(20), allowNull: true },
      quantity: { type: DataTypes.DECIMAL(10, 3), allowNull: false },
      unit_price: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      discount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      tax_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      tax_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      total_price: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
    },
    { tableName: 'invoice_items', underscored: true }
  )

  InvoiceItem.associate = db => {
    InvoiceItem.belongsTo(db.Invoice, { foreignKey: 'invoice_id', as: 'invoice' })
    InvoiceItem.belongsTo(db.TaxRate, { foreignKey: 'tax_rate_id', as: 'taxRate' })
  }

  return InvoiceItem
}
