import type {Metadata} from 'next';
export const metadata:Metadata={title:'XPACE · Professor',manifest:'/xpace-professor.webmanifest',appleWebApp:{capable:true,title:'XPACE Professor',statusBarStyle:'default'},robots:{index:false,follow:false}};
export default function Layout({children}:{children:React.ReactNode}){return children;}
