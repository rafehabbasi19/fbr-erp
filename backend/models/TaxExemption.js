'use strict'

module.exports = (sequelize, DataTypes) => {
  const TaxExemption = sequelize.define(
    'TaxExemption',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false },
      client_id: { type: DataTypes.UUID, allowNull: false },
      exemption_type: {
        type: DataTypes.ENUM('full', 'partial'),
        allowNull: false,
        defaultValue: 'full',
      },
      certificate_number: { type: DataTypes.STRING(100), allowNull: true },
      valid_from: { type: DataTypes.DATEONLY, allowNull: false },
      valid_until: { type: DataTypes.DATEONLY, allowNull: true },
      notes: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'tax_exemptions',
      underscored: true,
    }
  )

  TaxExemption.associate = db => {
    TaxExemption.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
    TaxExemption.belongsTo(db.Client, { foreignKey: 'client_id', as: 'client' })
  }

  return TaxExemption
}
