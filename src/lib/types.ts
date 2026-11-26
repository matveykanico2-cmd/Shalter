// Shapes returned by the API and consumed by the client.

export type UserLite = {
  id: number;
  username: string;
  name: string;
  avatar: string | null;
  verified: boolean;
};

export type Me = UserLite & { email: string; phone?: string | null; lastName: string; bio: string; website: string; privateAccount: boolean; showActivity: boolean; allowMessages: boolean };

export type Media = { url: string; kind: "image" | "video" };

export type Post = {
  id: number;
  type: "post" | "reel";
  caption: string;
  location: string;
  createdAt: number;
  user: UserLite & { isFollowing: boolean };
  media: Media[];
  likeCount: number;
  commentCount: number;
  liked: boolean;
  saved: boolean;
  /** Username of someone you follow who liked this post. */
  likedBy: string | null;
};

export type Comment = {
  id: number;
  text: string;
  createdAt: number;
  user: UserLite;
  likeCount: number;
  liked: boolean;
};

export type Profile = UserLite & {
  lastName: string;
  bio: string;
  website: string;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  followsYou: boolean;
  isMe: boolean;
  hasStory: boolean;
  isBusiness: boolean;
  businessCategory: string;
  /** People you follow who follow this profile (first few) and how many there are in total. */
  mutuals: { users: UserLite[]; count: number };
};

export type FollowUser = UserLite & { isFollowing: boolean; isMe: boolean };

export type Story = { id: number; url: string; kind: "image" | "video"; createdAt: number; seen: boolean };

export type StoryGroup = { user: UserLite; stories: Story[]; allSeen: boolean };

export type Highlight = { id: number; title: string; cover: Media };

export type Notification = {
  id: number;
  type: "like" | "comment" | "follow" | "comment_like";
  text: string;
  createdAt: number;
  read: boolean;
  actor: UserLite & { isFollowing: boolean };
  post: { id: number; thumb: Media } | null;
};

export type SharedPost = { id: number; caption: string; thumb: Media; user: UserLite };

export type InvoiceCard = {
  id: number;
  number: string;
  kind: "invoice" | "receipt";
  issuer: UserLite & { businessCategory: string };
  recipient: UserLite;
  issuedAt: number;
  items: { description: string; quantity: number; unitFils: number }[];
  totalFils: number;
  currency: string;
  paymentMethod: string;
  paymentReference: string;
  paidAt: number | null;
  /** Seeded demo data: the card shows a "TEST DATA" footer. */
  isSeed: boolean;
};

/** "welcome" is the automatic first message of a conversation (src/config/welcome-message.mjs). */
export type MessageKind = "text" | "post" | "voice" | "media" | "call" | "gift" | "poll" | "invoice" | "receipt" | "welcome";

export type Message = {
  id: number;
  senderId: number;
  kind: MessageKind;
  text: string;
  createdAt: number;
  post: SharedPost | null;
  invoice: InvoiceCard | null;
  /** Length of a voice note (placeholder only, no audio). */
  voiceSeconds: number | null;
  voiceUrl: string | null;
  media: Media | null;
  call: { type: "audio" | "video"; status: "outgoing" | "missed" | "ended" } | null;
  gift: { id: number | null; name: string; emoji: string; price: number } | null;
  poll: { question: string; options: { text: string; votes: number; voted: boolean }[]; totalVotes: number } | null;
  editedAt: number | null;
  pinnedAt: number | null;
  replyTo: { id: number; senderId: number; text: string } | null;
  reactions: { emoji: string; count: number; reacted: boolean }[];
};

export type Conversation = {
  id: number;
  kind: "direct" | "group" | "channel";
  title: string | null;
  memberCount: number;
  theme?: string;
  other: UserLite;
  lastMessage: { text: string; senderId: number; createdAt: number; kind: MessageKind } | null;
  unread: boolean;
  updatedAt: number;
};

export type Community = {
  id: number;
  name: string;
  slug: string;
  description: string;
  birthday: string | null;
  ownerId: number;
  memberCount: number;
  isPrivate: boolean;
  joined: boolean;
  role: "owner" | "admin" | "member" | null;
};
