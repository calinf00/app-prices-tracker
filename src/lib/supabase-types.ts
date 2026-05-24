export interface Family {
  id: string;
  name: string;
  created_by: string;
  invite_code: string;
  created_at: string;
}

export interface FamilyMember {
  id: string;
  family_id: string;
  user_id: string;
  role: 'owner' | 'member';
  joined_at: string;
}

export interface FamilyInvite {
  id: string;
  family_id: string;
  invited_by: string;
  email: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  created_at: string;
  expires_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'user'; // app_role enum
  created_at: string;
}
