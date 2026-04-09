'use strict'

async function getColumns(queryInterface, tableName) {
  try {
    return await queryInterface.describeTable(tableName)
  } catch (_err) {
    return {}
  }
}

async function addColumnIfMissing(queryInterface, tableName, columnName, definition) {
  const columns = await getColumns(queryInterface, tableName)
  if (!columns[columnName]) {
    await queryInterface.addColumn(tableName, columnName, definition)
  }
}

async function removeColumnIfExists(queryInterface, tableName, columnName) {
  const columns = await getColumns(queryInterface, tableName)
  if (columns[columnName]) {
    await queryInterface.removeColumn(tableName, columnName)
  }
}

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_invoices_status" ADD VALUE IF NOT EXISTS 'sent';
      ALTER TYPE "enum_invoices_status" ADD VALUE IF NOT EXISTS 'partially_paid';
      ALTER TYPE "enum_invoices_status" ADD VALUE IF NOT EXISTS 'paid';
      ALTER TYPE "enum_invoices_status" ADD VALUE IF NOT EXISTS 'overdue';
    `)

    await addColumnIfMissing(queryInterface, 'invoices', 'seller_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'issue_date', {
      type: Sequelize.DATEONLY,
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'currency', {
      type: Sequelize.STRING(10),
      allowNull: false,
      defaultValue: 'PKR',
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'discount_type', {
      type: Sequelize.ENUM('percentage', 'fixed'),
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'discount_value', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'discount_amount', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'total', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'amount_paid', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'terms', {
      type: Sequelize.TEXT,
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'fbr_usin', {
      type: Sequelize.STRING(150),
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'fbr_pos_id', {
      type: Sequelize.STRING(150),
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'qr_code_data', {
      type: Sequelize.TEXT,
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'qr_code_path', {
      type: Sequelize.STRING(500),
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'pdf_path', {
      type: Sequelize.STRING(500),
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'sent_at', {
      type: Sequelize.DATE,
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'invoices', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    })

    await queryInterface.sequelize.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type t
          WHERE t.typname = 'enum_invoices_fbr_status'
        ) THEN
          CREATE TYPE "enum_invoices_fbr_status" AS ENUM (
            'not_submitted',
            'pending',
            'submitted',
            'accepted',
            'rejected'
          );
        END IF;
      END;
      $$;
    `)

    const invoiceColumns = await getColumns(queryInterface, 'invoices')

    if (invoiceColumns.fbr_status) {
      await queryInterface.sequelize.query(`
        ALTER TABLE invoices
        ALTER COLUMN fbr_status TYPE "enum_invoices_fbr_status"
        USING (
          CASE LOWER(COALESCE(fbr_status::text, ''))
            WHEN '' THEN 'not_submitted'
            WHEN 'pending' THEN 'pending'
            WHEN 'submitted' THEN 'submitted'
            WHEN 'accepted' THEN 'accepted'
            WHEN 'verified' THEN 'accepted'
            WHEN 'rejected' THEN 'rejected'
            WHEN 'failed' THEN 'rejected'
            ELSE 'pending'
          END
        )::"enum_invoices_fbr_status";
      `)

      await queryInterface.changeColumn('invoices', 'fbr_status', {
        type: Sequelize.ENUM('not_submitted', 'pending', 'submitted', 'accepted', 'rejected'),
        allowNull: false,
        defaultValue: 'not_submitted',
      })
    }

    await queryInterface.sequelize.query(`
      UPDATE invoices
      SET
        seller_id = COALESCE(seller_id, created_by),
        issue_date = COALESCE(issue_date, invoice_date, DATE(created_at), CURRENT_DATE),
        currency = COALESCE(NULLIF(TRIM(currency), ''), 'PKR'),
        discount_value = COALESCE(discount_value, discount, 0),
        discount_amount = COALESCE(discount_amount, discount, 0),
        discount_type = CASE
          WHEN COALESCE(discount_amount, discount, 0) > 0 THEN COALESCE(discount_type, 'fixed'::"enum_invoices_discount_type")
          ELSE discount_type
        END,
        total = COALESCE(total, total_amount, 0),
        fbr_usin = COALESCE(fbr_usin, fbr_invoice_number),
        qr_code_path = COALESCE(qr_code_path, qr_code_url),
        status = CASE
          WHEN status = 'submitted' THEN 'sent'::"enum_invoices_status"
          WHEN status = 'verified' THEN CASE
            WHEN payment_status = 'paid' THEN 'paid'::"enum_invoices_status"
            WHEN payment_status = 'partial' THEN 'partially_paid'::"enum_invoices_status"
            WHEN payment_status = 'overdue' THEN 'overdue'::"enum_invoices_status"
            ELSE 'sent'::"enum_invoices_status"
          END
          WHEN status = 'failed' THEN 'draft'::"enum_invoices_status"
          ELSE status
        END;
    `)

    await queryInterface.sequelize.query(`
      UPDATE invoices i
      SET amount_paid = COALESCE(p.total_paid, 0)
      FROM (
        SELECT invoice_id, COALESCE(SUM(amount_paid), 0) AS total_paid
        FROM payments
        GROUP BY invoice_id
      ) p
      WHERE i.id = p.invoice_id;
    `)

    await queryInterface.changeColumn('invoices', 'issue_date', {
      type: Sequelize.DATEONLY,
      allowNull: false,
    })

    await queryInterface.changeColumn('invoices', 'currency', {
      type: Sequelize.STRING(10),
      allowNull: false,
      defaultValue: 'PKR',
    })

    await queryInterface.changeColumn('invoices', 'total', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
    })

    await queryInterface.changeColumn('invoices', 'amount_paid', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0,
    })

    await queryInterface.sequelize.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS balance_due DECIMAL(15, 2)
      GENERATED ALWAYS AS ((COALESCE(total, 0) - COALESCE(amount_paid, 0))) STORED;
    `)

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS invoices_company_issue_date_idx
      ON invoices (company_id, issue_date);
    `)

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS invoices_company_seller_idx
      ON invoices (company_id, seller_id);
    `)

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS invoices_company_status_issue_date_idx
      ON invoices (company_id, status, issue_date);
    `)

    await queryInterface.sequelize.query(`
      CREATE TABLE IF NOT EXISTS invoice_number_sequences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
        prefix VARCHAR(20) NOT NULL DEFAULT 'INV',
        next_number INTEGER NOT NULL DEFAULT 1,
        padding INTEGER NOT NULL DEFAULT 4,
        format VARCHAR(50) NOT NULL DEFAULT '{prefix}-{year}-{number}',
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await queryInterface.sequelize.query(`
      INSERT INTO invoice_number_sequences (
        id,
        company_id,
        prefix,
        next_number,
        padding,
        format
      )
      SELECT
        gen_random_uuid(),
        cs.company_id,
        COALESCE(NULLIF(TRIM(cs.invoice_prefix), ''), 'INV') AS prefix,
        GREATEST(COALESCE(cs.invoice_counter, 1), 1) AS next_number,
        4 AS padding,
        '{prefix}-{year}-{number}' AS format
      FROM company_settings cs
      ON CONFLICT (company_id) DO NOTHING;
    `)

    await queryInterface.sequelize.query(`
      INSERT INTO invoice_number_sequences (
        id,
        company_id,
        prefix,
        next_number,
        padding,
        format
      )
      SELECT
        gen_random_uuid(),
        c.id,
        'INV',
        1,
        4,
        '{prefix}-{year}-{number}'
      FROM companies c
      LEFT JOIN invoice_number_sequences ins
        ON ins.company_id = c.id
      WHERE ins.company_id IS NULL;
    `)

    await addColumnIfMissing(queryInterface, 'invoice_items', 'sort_order', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    })

    await addColumnIfMissing(queryInterface, 'invoice_items', 'description', {
      type: Sequelize.STRING(500),
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'invoice_items', 'unit', {
      type: Sequelize.STRING(50),
      allowNull: true,
    })

    await addColumnIfMissing(queryInterface, 'invoice_items', 'tax_rate_id', {
      type: Sequelize.UUID,
      allowNull: true,
      references: { model: 'tax_rates', key: 'id' },
      onDelete: 'SET NULL',
    })

    await addColumnIfMissing(queryInterface, 'invoice_items', 'tax_rate_percentage', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
    })

    await addColumnIfMissing(queryInterface, 'invoice_items', 'line_total', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: true,
    })

    await queryInterface.sequelize.query(`
      UPDATE invoice_items
      SET
        sort_order = COALESCE(sort_order, 0),
        description = COALESCE(NULLIF(TRIM(description), ''), NULLIF(TRIM(product_name), ''), 'Line item'),
        tax_rate_percentage = COALESCE(tax_rate_percentage, tax_rate, 0),
        line_total = COALESCE(line_total, total_price, (COALESCE(quantity, 0) * COALESCE(unit_price, 0)) + COALESCE(tax_amount, 0));
    `)

    await queryInterface.changeColumn('invoice_items', 'description', {
      type: Sequelize.STRING(500),
      allowNull: false,
    })

    await queryInterface.changeColumn('invoice_items', 'line_total', {
      type: Sequelize.DECIMAL(15, 2),
      allowNull: false,
    })

    await queryInterface.changeColumn('invoice_items', 'sort_order', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    })

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS invoice_items_invoice_sort_order_idx
      ON invoice_items (invoice_id, sort_order);
    `)

    await queryInterface.sequelize.query(`
      CREATE INDEX IF NOT EXISTS invoice_items_tax_rate_id_idx
      ON invoice_items (tax_rate_id);
    `)
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS invoice_items_tax_rate_id_idx;')
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS invoice_items_invoice_sort_order_idx;')

    await removeColumnIfExists(queryInterface, 'invoice_items', 'line_total')
    await removeColumnIfExists(queryInterface, 'invoice_items', 'tax_rate_percentage')
    await removeColumnIfExists(queryInterface, 'invoice_items', 'tax_rate_id')
    await removeColumnIfExists(queryInterface, 'invoice_items', 'unit')
    await removeColumnIfExists(queryInterface, 'invoice_items', 'description')
    await removeColumnIfExists(queryInterface, 'invoice_items', 'sort_order')

    await queryInterface.sequelize.query('DROP TABLE IF EXISTS invoice_number_sequences CASCADE;')

    await queryInterface.sequelize.query('DROP INDEX IF EXISTS invoices_company_status_issue_date_idx;')
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS invoices_company_seller_idx;')
    await queryInterface.sequelize.query('DROP INDEX IF EXISTS invoices_company_issue_date_idx;')

    await removeColumnIfExists(queryInterface, 'invoices', 'balance_due')

    const columns = await getColumns(queryInterface, 'invoices')
    if (columns.fbr_status) {
      await queryInterface.sequelize.query(`
        ALTER TABLE invoices
        ALTER COLUMN fbr_status TYPE VARCHAR(50)
        USING fbr_status::text;
      `)
    }

    await removeColumnIfExists(queryInterface, 'invoices', 'sent_at')
    await removeColumnIfExists(queryInterface, 'invoices', 'pdf_path')
    await removeColumnIfExists(queryInterface, 'invoices', 'qr_code_path')
    await removeColumnIfExists(queryInterface, 'invoices', 'qr_code_data')
    await removeColumnIfExists(queryInterface, 'invoices', 'fbr_pos_id')
    await removeColumnIfExists(queryInterface, 'invoices', 'fbr_usin')
    await removeColumnIfExists(queryInterface, 'invoices', 'terms')
    await removeColumnIfExists(queryInterface, 'invoices', 'amount_paid')
    await removeColumnIfExists(queryInterface, 'invoices', 'total')
    await removeColumnIfExists(queryInterface, 'invoices', 'discount_amount')
    await removeColumnIfExists(queryInterface, 'invoices', 'discount_value')
    await removeColumnIfExists(queryInterface, 'invoices', 'discount_type')
    await removeColumnIfExists(queryInterface, 'invoices', 'currency')
    await removeColumnIfExists(queryInterface, 'invoices', 'issue_date')
    await removeColumnIfExists(queryInterface, 'invoices', 'seller_id')
    await removeColumnIfExists(queryInterface, 'invoices', 'deleted_at')

    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_invoices_discount_type";')
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_invoices_fbr_status";')

    await queryInterface.changeColumn('invoices', 'fbr_status', {
      type: Sequelize.STRING(50),
      allowNull: true,
    })
  },
}
