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
      ntn: { type: DataTypes.STRING(20), allowNull: true },
      cnic: { type: DataTypes.STRING(15), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      address: { type: DataTypes.TEXT, allowNull: true },
      city: { type: DataTypes.STRING(100), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    { tableName: 'clients', underscored: true }
  )

  Client.associate = db => {
    Client.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
    Client.belongsTo(db.User, { foreignKey: 'created_by', as: 'creator' })
    Client.hasMany(db.Invoice, { foreignKey: 'client_id', as: 'invoices' })
  }

  return Client
}
