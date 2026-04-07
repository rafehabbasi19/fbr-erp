'use strict'

module.exports = (sequelize, DataTypes) => {
  const AccessTokenBlacklist = sequelize.define(
    'AccessTokenBlacklist',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: true },
      token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      expires_at: { type: DataTypes.DATE, allowNull: false },
    },
    { tableName: 'access_token_blacklist', underscored: true, updatedAt: false }
  )

  AccessTokenBlacklist.associate = db => {
    if (db.User) {
      AccessTokenBlacklist.belongsTo(db.User, { foreignKey: 'user_id', as: 'user' })
    }
  }

  return AccessTokenBlacklist
}
