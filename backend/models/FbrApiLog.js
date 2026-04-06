'use strict'

module.exports = (sequelize, DataTypes) => {
  const FbrApiLog = sequelize.define(
    'FbrApiLog',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false },
      invoice_id: { type: DataTypes.UUID, allowNull: true },
      request_payload_hash: { type: DataTypes.STRING(64), allowNull: true },
      response_status: { type: DataTypes.INTEGER, allowNull: true },
      fbr_invoice_number: { type: DataTypes.STRING(100), allowNull: true },
      error_message: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'fbr_api_logs', underscored: true, updatedAt: false }
  )

  FbrApiLog.associate = db => {
    FbrApiLog.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
    FbrApiLog.belongsTo(db.Invoice, { foreignKey: 'invoice_id', as: 'invoice' })
  }

  return FbrApiLog
}
