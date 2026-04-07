'use strict'

module.exports = (sequelize, DataTypes) => {
  const PasswordResetToken = sequelize.define(
    'PasswordResetToken',
    {
      email: { type: DataTypes.STRING(255), allowNull: false },
      token_hash: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        primaryKey: true,
      },
      expires_at: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'password_reset_tokens',
      underscored: true,
      createdAt: 'created_at',
      updatedAt: false,
    }
  )

  return PasswordResetToken
}
