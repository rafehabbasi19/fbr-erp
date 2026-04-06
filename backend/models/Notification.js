'use strict'

module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    'Notification',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: true },
      type: { type: DataTypes.STRING(100), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      is_read: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      entity_id: { type: DataTypes.UUID, allowNull: true },
    },
    { tableName: 'notifications', underscored: true, updatedAt: false }
  )

  Notification.associate = db => {
    Notification.belongsTo(db.Company, { foreignKey: 'company_id', as: 'company' })
    Notification.belongsTo(db.User, { foreignKey: 'user_id', as: 'user' })
  }

  return Notification
}
