import { Avatar } from "@/shared/ui";

import styles from "./community-avatar.module.css";

type Props = { community: { title: string; avatarColor?: string | null; avatarImage?: string | null }; size?: number };

/** Аватар сообщества с двумя «карточками» за ним — CommunityAvatar (tweb CommunityAvatarDecoration). */
export function CommunityAvatar({ community, size = 54 }: Props) {
  return (
    <span className={styles.wrap} style={{ width: size, height: size }}>
      <svg className={styles.decoration} viewBox="0 0 125 100" fill="none" aria-hidden="true">
        <path
          opacity="0.15"
          d="M26.4382 12.0185C26.0639 12.6406 25.7099 13.2766 25.3787 13.9267C23.6015 17.4147 22.788 21.3107 22.3913 26.165C21.9976 30.9845 21.9997 37.0086 21.9997 44.7997V55.2001C21.9997 62.9912 21.9976 69.0154 22.3913 73.8349C22.788 78.6891 23.6016 82.5852 25.3787 86.0732C26.6559 88.5799 28.2611 90.8845 30.1384 92.9345C28.104 91.6505 26.3049 90.0031 24.8396 88.0585C21.9499 84.2238 20.977 78.7084 19.032 67.6777L15.2117 46.0117C13.2667 34.9811 12.2943 29.4656 13.698 24.874C14.9328 20.8349 17.4147 17.2898 20.7878 14.748C22.3208 13.5928 24.123 12.7455 26.4382 12.0185Z"
          fill="currentColor"
        />
        <path
          opacity="0.1"
          d="M10.3996 25.7243C9.94967 28.0394 9.95115 30.4979 10.2131 33.3063C10.5379 36.7882 11.2941 41.0664 12.258 46.5329L16.0783 68.1989C17.0421 73.665 17.7943 77.9439 18.6799 81.3268C19.5744 84.7434 20.6657 87.5055 22.4436 89.8649C23.0895 90.722 23.7919 91.5293 24.5441 92.2819C23.6762 91.7404 22.8569 91.1149 22.1008 90.4098C19.2915 87.7901 17.7593 83.5791 14.6945 75.1588L6.89668 53.734C3.83196 45.3138 2.29974 41.1032 2.76778 37.2907C3.17959 33.9371 4.6422 30.7998 6.94649 28.3288C7.86463 27.3442 8.97798 26.5161 10.3996 25.7243Z"
          fill="currentColor"
        />
      </svg>
      <Avatar size={size} name={community.title} color={community.avatarColor} image={community.avatarImage} />
    </span>
  );
}
