'use strict'

module.exports = (sequelize, DataTypes) => {
  const Invoice = sequelize.define(
    'Invoice',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false },
      client_id: { type: DataTypes.UUID, allowNull: false },
      created_by: { type: DataTypes.UUID, allowNull: true },
      invoice_number: { type: DataTypes.STRING(50), allowNull: false },
      invoice_date: { type: DataTypes.DATEONLY, allowNull: false },
      due_date: { type: DataTypes.DATEONLY, allowNull: false },
      status: {
        type: DataTypes.ENUM('draft', 'submitted', 'verified', 'failed', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft',
      },
      payment_status: {
        type: DataTypes.ENUM('unpaid', 'partial', 'paid', 'overdue'),
        allowNull: false,
        defaultValue: 'unpaid',
      },
      subtotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      discount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      tax_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      total_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      notes: { type: DataTypes.TEXT, allowNull: true },
      fbr_invoice_number: { type: DataTypes.STRING(100), allowNull: true },
      fbr_status: { type: DataTypes.STRING(50), allowNull: true },
      qr_code_url: { type: DataTypes.STRING(500), allowNull: true },
    },
    { tableName: 'invoices', underscored: true }
  )

  Invoice.associate = db => {
    Invoice.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
    Invoice.belongsTo(db.Client, { foreignKey: 'client_id', as: 'client' })
    Invoice.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' })
    Invoice.hasMany(db.InvoiceItem, { foreignKey: 'invoice_id', as: 'items' })
    Invoice.hasMany(db.Payment, { foreignKey: 'invoice_id', as: 'payments' })
    Invoice.hasMany(db.FbrSubmission, { foreignKey: 'invoice_id', as: 'fbrSubmissions' })
    Invoice.hasMany(db.FbrApiLog, { foreignKey: 'invoice_id', as: 'fbrLogs' })
  }

  return Invoice
}
