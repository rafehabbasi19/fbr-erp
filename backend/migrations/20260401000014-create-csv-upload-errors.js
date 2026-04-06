'use strict'

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('csv_upload_errors', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
        allowNull: false,
      },
      upload_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'csv_uploads', key: 'id' },
        onDelete: 'CASCADE',
      },
      row_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
        comment: '1-indexed row number in the CSV',
      },
      field: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Column name that failed validation',
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    })

    await queryInterface.addIndex('csv_upload_errors', ['upload_id'])
  },

  async down(queryInterface) {
    await queryInterface.dropTable('csv_upload_errors')
  },
}
