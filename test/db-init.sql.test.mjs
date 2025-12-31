import test from 'node:test'
import assert from 'node:assert/strict'

import {
  sqlSecuritySchemaBase,
  sqlSecurityOptionalEmail,
  sqlSecurityOperationalColumnsAndAudit,
  sqlSessionTable,
  sqlEnterpriseDemo
} from '../scripts/db-init.mjs'

test('sqlSecuritySchemaBase includes required tables', () => {
  const sql = sqlSecuritySchemaBase().join('\n')
  assert.match(sql, /create schema if not exists security;/)
  assert.match(sql, /create table if not exists security\.profile/)
  assert.match(sql, /create table if not exists security\."user"/)
  assert.match(sql, /create table if not exists security\.user_profile/)
  assert.match(sql, /create table if not exists security\.object/)
  assert.match(sql, /create table if not exists security\.method/)
  assert.match(sql, /create table if not exists security\.permission_method/)
})

test('sqlSecurityOptionalEmail adds email column and unique index', () => {
  const sql = sqlSecurityOptionalEmail().join('\n')
  assert.match(sql, /alter table security\."user" add column if not exists user_em/)
  assert.match(sql, /create unique index if not exists uq_user_em/)
})

test('sqlSecurityOperationalColumnsAndAudit adds conventional columns and audit table', () => {
  const sql = sqlSecurityOperationalColumnsAndAudit().join('\n')

  assert.match(sql, /alter table security\.profile add column if not exists profile_na/)
  assert.match(sql, /alter table security\."user" add column if not exists is_active boolean/)
  assert.match(sql, /alter table security\."user" add column if not exists created_at/)
  assert.match(sql, /alter table security\."user" add column if not exists updated_at/)
  assert.match(sql, /alter table security\."user" add column if not exists last_login_at/)

  assert.match(sql, /create table if not exists security\.audit_log/)
  assert.match(sql, /ix_audit_log_time/)
})

test('sqlSessionTable defaults to public.session', () => {
  const sql = sqlSessionTable('public', 'session').join('\n')
  assert.doesNotMatch(sql, /create schema if not exists public;/)
  assert.match(sql, /create table if not exists public\.session/)
  assert.match(sql, /session_expire_idx/)
})

test('sqlSessionTable supports custom schema', () => {
  const sql = sqlSessionTable('security', 'session').join('\n')
  assert.match(sql, /create schema if not exists security;/)
  assert.match(sql, /create table if not exists security\.session/)
})

test('sqlEnterpriseDemo creates enterprise.person', () => {
  const sql = sqlEnterpriseDemo().join('\n')
  assert.match(sql, /create schema if not exists enterprise;/)
  assert.match(sql, /create table if not exists enterprise\.person/)
})
