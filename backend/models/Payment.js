'use strict'

const {
  clearDashboardSummaryCache,
  invalidateDashboardSummaryCacheForCompany,
} = require('../services/dashboardCacheService')

module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define(
    'Payment',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      invoice_id: { type: DataTypes.UUID, allowNull: false },
      amount_paid: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
      payment_date: { type: DataTypes.DATEONLY, allowNull: false },
      payment_method: {
        type: DataTypes.ENUM('cash', 'bank_transfer', 'cheque', 'online'),
        allowNull: false,
        defaultValue: 'bank_transfer',
      },
      reference_number: { type: DataTypes.STRING(100), allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
      recorded_by: { type: DataTypes.UUID, allowNull: true },
    },
    { tableName: 'payments', underscored: true, updatedAt: false }
  )

  Payment.associate = db => {
    Payment.belongsTo(db.Invoice, { foreignKey: 'invoice_id', as: 'invoice' })
    Payment.belongsTo(db.User, { foreignKey: 'recorded_by', as: 'recorder' })
  }

  async function invalidateSummaryCacheByPayment(payment) {
    if (!payment || !payment.invoice_id) {
      await clearDashboardSummaryCache()
      return
    }

    const invoice = await sequelize.models.Invoice.findByPk(payment.invoice_id, {
      attributes: ['company_id'],
    })

    if (!invoice || !invoice.company_id) {
      await clearDashboardSummaryCache()
      return
    }

    await invalidateDashboardSummaryCacheForCompany(invoice.company_id)
  }

  Payment.addHook(
    'afterCreate',
    'invalidateDashboardSummaryCacheAfterCreatePayment',
    invalidateSummaryCacheByPayment
  )

  Payment.addHook(
    'afterUpdate',
    'invalidateDashboardSummaryCacheAfterUpdatePayment',
    invalidateSummaryCacheByPayment
  )

  Payment.addHook(
    'afterDestroy',
    'invalidateDashboardSummaryCacheAfterDestroyPayment',
    invalidateSummaryCacheByPayment
  )

  Payment.addHook('afterBulkCreate', 'invalidateDashboardSummaryCacheAfterBulkCreatePayment', async () => {
    await clearDashboardSummaryCache()
  })

  Payment.addHook('afterBulkUpdate', 'invalidateDashboardSummaryCacheAfterBulkUpdatePayment', async () => {
    await clearDashboardSummaryCache()
  })

  Payment.addHook('afterBulkDestroy', 'invalidateDashboardSummaryCacheAfterBulkDestroyPayment', async () => {
    await clearDashboardSummaryCache()
  })

  return Payment
}
