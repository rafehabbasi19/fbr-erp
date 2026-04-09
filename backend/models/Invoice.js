'use strict'

const {
  clearDashboardSummaryCache,
  invalidateDashboardSummaryCacheForCompany,
} = require('../services/dashboardCacheService')

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
      seller_id: { type: DataTypes.UUID, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      invoice_number: { type: DataTypes.STRING(50), allowNull: false },
      issue_date: { type: DataTypes.DATEONLY, allowNull: false },
      invoice_date: { type: DataTypes.DATEONLY, allowNull: false },
      due_date: { type: DataTypes.DATEONLY, allowNull: false },
      status: {
        type: DataTypes.ENUM(
          'draft',
          'sent',
          'partially_paid',
          'paid',
          'overdue',
          'cancelled',
          'submitted',
          'verified',
          'failed'
        ),
        allowNull: false,
        defaultValue: 'draft',
      },
      payment_status: {
        type: DataTypes.ENUM('unpaid', 'partial', 'paid', 'overdue'),
        allowNull: false,
        defaultValue: 'unpaid',
      },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PKR' },
      subtotal: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      discount_type: {
        type: DataTypes.ENUM('percentage', 'fixed'),
        allowNull: true,
      },
      discount_value: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      discount_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      discount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      tax_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      total: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      total_amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      amount_paid: { type: DataTypes.DECIMAL(15, 2), allowNull: false, defaultValue: 0 },
      balance_due: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      terms: { type: DataTypes.TEXT, allowNull: true },
      fbr_status: {
        type: DataTypes.ENUM('not_submitted', 'pending', 'submitted', 'accepted', 'rejected'),
        allowNull: false,
        defaultValue: 'not_submitted',
      },
      fbr_usin: { type: DataTypes.STRING(150), allowNull: true },
      fbr_pos_id: { type: DataTypes.STRING(150), allowNull: true },
      fbr_invoice_number: { type: DataTypes.STRING(100), allowNull: true },
      qr_code_data: { type: DataTypes.TEXT, allowNull: true },
      qr_code_path: { type: DataTypes.STRING(500), allowNull: true },
      qr_code_url: { type: DataTypes.STRING(500), allowNull: true },
      pdf_path: { type: DataTypes.STRING(500), allowNull: true },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'invoices',
      underscored: true,
      paranoid: true,
      deletedAt: 'deleted_at',
    }
  )

  Invoice.associate = db => {
    Invoice.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
    Invoice.belongsTo(db.Client, { foreignKey: 'client_id', as: 'client' })
    Invoice.belongsTo(db.User, { foreignKey: 'seller_id', as: 'seller' })
    Invoice.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' })
    Invoice.hasMany(db.InvoiceItem, { foreignKey: 'invoice_id', as: 'items' })
    Invoice.hasMany(db.Payment, { foreignKey: 'invoice_id', as: 'payments' })
    Invoice.hasMany(db.FbrSubmission, { foreignKey: 'invoice_id', as: 'fbrSubmissions' })
    Invoice.hasMany(db.FbrApiLog, { foreignKey: 'invoice_id', as: 'fbrLogs' })
  }

  async function invalidateSummaryCacheByInvoice(invoice) {
    if (!invoice || !invoice.company_id) {
      await clearDashboardSummaryCache()
      return
    }

    await invalidateDashboardSummaryCacheForCompany(invoice.company_id)
  }

  Invoice.addHook(
    'afterCreate',
    'invalidateDashboardSummaryCacheAfterCreateInvoice',
    invalidateSummaryCacheByInvoice
  )

  Invoice.addHook(
    'afterUpdate',
    'invalidateDashboardSummaryCacheAfterUpdateInvoice',
    invalidateSummaryCacheByInvoice
  )

  Invoice.addHook(
    'afterDestroy',
    'invalidateDashboardSummaryCacheAfterDestroyInvoice',
    invalidateSummaryCacheByInvoice
  )

  Invoice.addHook('afterBulkCreate', 'invalidateDashboardSummaryCacheAfterBulkCreateInvoice', async () => {
    await clearDashboardSummaryCache()
  })

  Invoice.addHook('afterBulkUpdate', 'invalidateDashboardSummaryCacheAfterBulkUpdateInvoice', async () => {
    await clearDashboardSummaryCache()
  })

  Invoice.addHook('afterBulkDestroy', 'invalidateDashboardSummaryCacheAfterBulkDestroyInvoice', async () => {
    await clearDashboardSummaryCache()
  })

  return Invoice
}
