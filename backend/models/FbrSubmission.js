'use strict'

module.exports = (sequelize, DataTypes) => {
  const FbrSubmission = sequelize.define(
    'FbrSubmission',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      invoice_id: { type: DataTypes.UUID, allowNull: false },
      attempt_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      status: { type: DataTypes.STRING(50), allowNull: false },
      fbr_response: { type: DataTypes.JSONB, allowNull: true },
      submitted_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: 'fbr_submissions', underscored: true, updatedAt: false }
  )

  FbrSubmission.associate = db => {
    FbrSubmission.belongsTo(db.Invoice, { foreignKey: 'invoice_id', as: 'invoice' })
  }

  return FbrSubmission
}
