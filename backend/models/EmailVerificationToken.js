'use strict'

module.exports = (sequelize, DataTypes) => {
  const EmailVerificationToken = sequelize.define(
    'EmailVerificationToken',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      token_hash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      purpose: {
        type: DataTypes.ENUM('register', 'resend'),
        allowNull: false,
        defaultValue: 'register',
      },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      used_at: { type: DataTypes.DATE, allowNull: true },
    },
    { tableName: 'email_verification_tokens', underscored: true }
  )

  EmailVerificationToken.associate = db => {
    if (db.User) {
      EmailVerificationToken.belongsTo(db.User, { foreignKey: 'user_id', as: 'user' })
    }
  }

  return EmailVerificationToken
}
