import React from 'react';

interface LoadingProps {
    size?: 'sm' | 'md' | 'lg' | 'xl';
    fullScreen?: boolean;
    text?: string;
}

export default function Loading({ size = 'md', fullScreen = false, text }: LoadingProps) {
    const sizeClasses = {
        sm: 'w-6 h-6 border-2',
        md: 'w-10 h-10 border-3',
        lg: 'w-16 h-16 border-4',
        xl: 'xl:w-24 xl:h-24 w-20 h-20 border-[5px]',
    };

    const spinnerContent = (
        <div className="flex flex-col items-center justify-center gap-3">
            <div className="relative flex items-center justify-center">
                <div
                    className={`${sizeClasses[size]} rounded-full border-[#ffa229]/20`}
                ></div>

                <div
                    className={`absolute top-0 ${sizeClasses[size]} rounded-full border-t-[#ffa229] border-r-transparent border-b-transparent border-l-transparent animate-spin`}
                    style={{
                        filter: 'drop-shadow(0 0 6px #ffa229)',
                    }}
                ></div>

                <div className="absolute w-1.5 h-1.5 rounded-full bg-[#ffa229] animate-ping"></div>
            </div>

            {text && (
                <p className="text-sm font-medium text-[#ffa229] animate-pulse">
                    {text}
                </p>
            )}
        </div>
    );

    if (fullScreen) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                {spinnerContent}
            </div>
        );
    }

    return <div className="flex items-center justify-center p-4">{spinnerContent}</div>;
}