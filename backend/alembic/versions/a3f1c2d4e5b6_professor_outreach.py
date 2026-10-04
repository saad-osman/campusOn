"""professor outreach tracker

Revision ID: a3f1c2d4e5b6
Revises: 0107c6680fc6
Create Date: 2026-10-04 18:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a3f1c2d4e5b6'
down_revision: Union[str, Sequence[str], None] = '0107c6680fc6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('professor_outreach',
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('professor_name', sa.String(length=255), nullable=False),
    sa.Column('affiliation', sa.String(length=300), nullable=True),
    sa.Column('author_id', sa.String(length=64), nullable=True),
    sa.Column('profile_url', sa.String(length=500), nullable=True),
    sa.Column('paper_title', sa.String(length=500), nullable=True),
    sa.Column('opportunity_id', sa.String(length=36), nullable=True),
    sa.Column('opportunity_title', sa.String(length=500), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('sent_on', sa.Date(), nullable=False),
    sa.Column('follow_up_on', sa.Date(), nullable=True),
    sa.Column('follow_ups', sa.Integer(), nullable=False),
    sa.Column('reminded_on', sa.Date(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=False),
    sa.Column('updated_at', sa.DateTime(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('professor_outreach', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_professor_outreach_user_id'), ['user_id'], unique=False)


def downgrade() -> None:
    with op.batch_alter_table('professor_outreach', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_professor_outreach_user_id'))
    op.drop_table('professor_outreach')
