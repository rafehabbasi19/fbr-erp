'use strict'

module.exports = (sequelize, DataTypes) => {
  const ClientContact = sequelize.define(
    'ClientContact',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      client_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(200), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: true },
      phone: { type: DataTypes.STRING(30), allowNull: true },
      designation: { type: DataTypes.STRING(100), allowNull: true },
      is_primary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: 'client_contacts',
      underscored: true,
      updatedAt: false,
    }
  )

  ClientContact.associate = db => {
    ClientContact.belongsTo(db.Client, { foreignKey: 'client_id', as: 'client' })
  }

  return ClientContact
}
