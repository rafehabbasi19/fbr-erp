'use strict'

module.exports = (sequelize, DataTypes) => {
  const RoleUser = sequelize.define(
    'RoleUser',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      role_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
    },
    { tableName: 'role_user', underscored: true, updatedAt: false }
  )

  RoleUser.associate = db => {
    if (db.Role) {
      RoleUser.belongsTo(db.Role, { foreignKey: 'role_id', as: 'role' })
    }
    if (db.User) {
      RoleUser.belongsTo(db.User, { foreignKey: 'user_id', as: 'user' })
    }
  }

  return RoleUser
}
