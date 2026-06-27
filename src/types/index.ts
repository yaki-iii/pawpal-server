import type { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';

// ==================== Request Types ====================

export interface AuthenticatedRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    email: string;
  };
}

// ==================== Response Types ====================

export interface UserDTO {
  id: string;
  email: string;
  nickname: string;
  avatar: string;
  bio: string;
  city: string;
  membershipLevel: string;
  createdAt: string;
  updatedAt: string;
}

export interface PetDTO {
  id: string;
  userId: string;
  name: string;
  species: string;
  breed: string;
  gender: string;
  birthday: string | null;
  weight: number;
  photo: string;
  neutered: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface HealthRecordDTO {
  id: string;
  petId: string;
  type: string;
  date: string;
  itemName: string;
  notes: string;
  images: string[];
  createdAt: string;
}

export interface WeightRecordDTO {
  id: string;
  petId: string;
  weight: number;
  date: string;
  createdAt: string;
}

export interface ReminderDTO {
  id: string;
  petId: string;
  type: string;
  nextDate: string;
  cycleDays: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PostDTO {
  id: string;
  userId: string;
  circleId: string | null;
  petId: string | null;
  title: string;
  content: string;
  images: string[];
  tags: string[];
  likeCount: number;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  author?: UserDTO;
  pet?: PetDTO | null;
  circle?: CircleDTO | null;
  isLiked?: boolean;
  isPinned?: boolean;
  isRemoved?: boolean;
}

export interface CircleDTO {
  id: string;
  name: string;
  type: string;
  species: string | null;
  coverImage: string;
  description: string;
  ownerId: string | null;
  createdByUserId: string | null;
  isVerified: boolean;
  rules: string;
  visibility: string;
  moderatorNote: string;
  lastActiveAt: string;
  memberCount: number;
  postCount: number;
  createdAt: string;
  isJoined?: boolean;
  myRole?: string;
}

export interface CommentDTO {
  id: string;
  postId: string;
  userId: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  author?: UserDTO;
  replies?: CommentDTO[];
}

export interface MomentCommentDTO {
  id: string;
  postId: string;
  momentId: string;
  userId: string;
  parentId: string | null;
  content: string;
  createdAt: string;
  author?: UserDTO;
  replies?: MomentCommentDTO[];
}

export interface AIAssistantSessionDTO {
  id: string;
  userId: string;
  petId: string | null;
  question: string;
  imageUrls: string[];
  questionType: string;
  summary: string;
  sources: unknown[];
  resultCard?: AIResultCardDTO;
  status: string;
  conversationId: string | null;
  role: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AIResultCardDTO {
  severity: 'low' | 'medium' | 'high';
  visualFindings: string[];
  possibleCauses: string[];
  suggestions: string[];
  shouldSeeVet: boolean;
  vetReminder: string;
}

export interface AISource {
  type: 'post' | 'article' | 'web';
  title: string;
  url: string;
  snippet: string;
}

export interface MomentDTO {
  id: string;
  userId: string;
  petId: string;
  content: string;
  images: string[];
  videos: string[];
  mood: string;
  location: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  createdAt: string;
  updatedAt: string;
  author?: UserDTO;
  pet?: PetDTO | null;
  isLiked?: boolean;
}

export interface EmergencyHelpDTO {
  id: string;
  userId: string;
  petId: string | null;
  type: string;
  description: string;
  urgency: string;
  location: string;
  lat: number | null;
  lng: number | null;
  status: string;
  responders: number;
  createdAt: string;
  resolvedAt: string | null;
  author?: UserDTO;
}

export interface VetClinicDTO {
  id: string;
  name: string;
  address: string;
  city?: string;
  phone: string;
  lat: number;
  lng: number;
  is24Hour: boolean;
  rating: number;
  distance?: number;
  distanceMeters?: number;
  businessHours?: string;
  openStatus?: string;
}

export interface CircleMemberDTO {
  id: string;
  circleId: string;
  userId: string;
  role: string;
  status: string;
  bannedUntil: string | null;
  warningCount: number;
  joinedAt: string;
  user?: UserDTO;
}

export interface CircleJoinRequestDTO {
  id: string;
  circleId: string;
  userId: string;
  message: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  user?: UserDTO;
}

// ==================== Service Types ====================

export interface FeedQuery {
  type: string;
  cursor?: string;
  limit: number;
}

export interface SearchResult {
  posts: PostDTO[];
  circles: CircleDTO[];
  users: UserDTO[];
  pets: PetDTO[];
  moments: MomentDTO[];
}

export interface GrowthDiaryEntryDTO {
  id: string;
  petId: string;
  userId: string;
  title: string;
  content: string;
  mood: string;
  photos: string[];
  videos: string[];
  createdAt: string;
}

export interface NotificationDTO {
  id: string;
  userId: string;
  type: string;
  content: string;
  linkUrl: string;
  isRead: boolean;
  createdAt: string;
}

// ==================== Pagination Types ====================

export interface PaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
}
