'use strict'

module.exports = (sequelize, DataTypes) => {
  const InvoiceNumberSequence = sequelize.define(
    'InvoiceNumberSequence',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false, unique: true },
      prefix: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'INV' },
      next_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      padding: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
      format: {
        type: DataTypes.STRING(50),
        allowNull: false,
        defaultValue: '{prefix}-{year}-{number}',
      },
    },
    {
      tableName: 'invoice_number_sequences',
      underscored: true,
    }
  )

  InvoiceNumberSequence.associate = db => {
    InvoiceNumberSequence.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
  }

  return InvoiceNumberSequence
}
