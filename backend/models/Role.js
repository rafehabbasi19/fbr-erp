'use strict'

module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define(
    'Role',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(255), allowNull: true },
    },
    { tableName: 'roles', underscored: true }
  )

  Role.associate = db => {
    if (db.User) {
      Role.hasMany(db.User, { foreignKey: 'role_id', as: 'users' })
    }
    if (db.RoleUser) {
      Role.hasMany(db.RoleUser, { foreignKey: 'role_id', as: 'roleUsers' })
    }
  }

  return Role
}
