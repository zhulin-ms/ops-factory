interface UserAvatarIconProps {
    className?: string
}

export default function UserAvatarIcon({ className = '' }: UserAvatarIconProps) {
    return (
        <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            aria-hidden="true"
        >
            <path
                d="M12 12.25C13.7949 12.25 15.25 10.7949 15.25 9C15.25 7.20507 13.7949 5.75 12 5.75C10.2051 5.75 8.75 7.20507 8.75 9C8.75 10.7949 10.2051 12.25 12 12.25Z"
                fill="currentColor"
            />
            <path
                d="M12 13.75C8.82436 13.75 6.25 16.3244 6.25 19.5C6.25 19.9142 6.58579 20.25 7 20.25H17C17.4142 20.25 17.75 19.9142 17.75 19.5C17.75 16.3244 15.1756 13.75 12 13.75Z"
                fill="currentColor"
            />
        </svg>
    )
}
