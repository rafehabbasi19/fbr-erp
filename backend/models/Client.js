'use strict'

module.exports = (sequelize, DataTypes) => {
  const Client = sequelize.define(
    'Client',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(255), allowNull: false },
      client_type: {
        type: DataTypes.ENUM('individual', 'business'),
        allowNull: false,
        defaultValue: 'business',
      },
      ntn: { type: DataTypes.STRING(20), allowNull: true },
      cnic: { type: DataTypes.STRING(15), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      city: { type: DataTypes.STRING(100), allowNull: true },
      province: { type: DataTypes.STRING(100), allowNull: true },
      postal_code: { type: DataTypes.STRING(20), allowNull: true },
      country: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'Pakistan' },
      strn: { type: DataTypes.STRING(50), allowNull: true },
      credit_limit: { type: DataTypes.DECIMAL(15, 2), allowNull: true },
      payment_terms_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 30 },
      notes: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM('active', 'inactive'),
        allowNull: false,
        defaultValue: 'active',
      },
      created_by: { type: DataTypes.UUID, allowNull: true },
      deleted_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'clients',
      underscored: true,
      paranoid: true,
      deletedAt: 'deleted_at',
    }
  )

  Client.associate = db => {
    Client.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
    Client.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' })
    Client.hasMany(db.Invoice, { foreignKey: 'client_id', as: 'invoices' })
    if (db.TaxExemption) {
      Client.hasMany(db.TaxExemption, { foreignKey: 'client_id', as: 'taxExemptions' })
    }
    if (db.ClientContact) {
      Client.hasMany(db.ClientContact, { foreignKey: 'client_id', as: 'contacts' })
    }
  }

  return Client
}
