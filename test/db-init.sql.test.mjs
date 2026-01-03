import test from 'node:test'
import assert from 'node:assert/strict'

import {
    sqlSecuritySchemaBase,
    sqlSecurityOptionalEmail,
    sqlSecurityOperationalColumnsAndAudit,
    sqlAuthUserIdentifierTweaks,
    sqlAuthTables,
    sqlAuthLogin2StepTables,
    sqlSessionTable,
} from '../scripts/db-init.ts'

test('sqlSecuritySchemaBase includes required tables', () => {
    const sql = sqlSecuritySchemaBase().join('\n')
    assert.match(sql, /create schema if not exists security;/)
    assert.match(sql, /create table if not exists security\.profiles/)
    assert.match(sql, /create table if not exists security\.users/)
    assert.match(sql, /create table if not exists security\.user_profiles/)
    assert.match(sql, /create table if not exists security\.objects/)
    assert.match(sql, /create table if not exists security\.methods/)
    assert.match(sql, /create table if not exists security\.permission_methods/)
})

test('sqlSecurityOptionalEmail adds email column and unique index', () => {
    const sql = sqlSecurityOptionalEmail().join('\n')
    assert.match(sql, /alter table security\.users add column if not exists email/)
    assert.match(sql, /alter table security\.users add column if not exists email_verified_at/)
    assert.match(sql, /create unique index if not exists uq_users_email/)
})

test('sqlSecurityOperationalColumnsAndAudit adds conventional columns and audit table', () => {
    const sql = sqlSecurityOperationalColumnsAndAudit().join('\n')

    assert.match(sql, /alter table security\.profiles add column if not exists profile_name/)
    assert.match(sql, /alter table security\.users add column if not exists is_active boolean/)
    assert.match(sql, /alter table security\.users add column if not exists created_at/)
    assert.match(sql, /alter table security\.users add column if not exists updated_at/)
    assert.match(sql, /alter table security\.users add column if not exists last_login_at/)

    assert.match(sql, /create table if not exists security\.audit_logs/)
    assert.match(sql, /ix_audit_logs_created_at/)
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

test('sqlAuthUserIdentifierTweaks drops NOT NULL when authUsername=false', () => {
    const sql = sqlAuthUserIdentifierTweaks({ authUsername: false }).join('\n')
    assert.match(sql, /alter table security\.users alter column username drop not null;/)
})

test('sqlAuthTables creates password reset + one-time code tables', () => {
    const sql = sqlAuthTables().join('\n')
    assert.match(sql, /create table if not exists security\.password_resets/)
    assert.match(sql, /create table if not exists security\.one_time_codes/)
    assert.match(sql, /uq_password_resets_token_hash/)
    assert.match(sql, /ix_one_time_codes_user_purpose/)
})

test('sqlAuthLogin2StepTables creates device + login challenge tables', () => {
    const sql = sqlAuthLogin2StepTables().join('\n')
    assert.match(sql, /create table if not exists security\.user_devices/)
    assert.match(sql, /create table if not exists security\.login_challenges/)
    assert.match(sql, /uq_user_devices_token_hash/)
    assert.match(sql, /uq_login_challenges_token_hash/)
})
