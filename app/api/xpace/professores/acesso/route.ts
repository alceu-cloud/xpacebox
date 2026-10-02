import {NextResponse} from 'next/server';
function moved(){return NextResponse.json({success:false,message:'GERENCIE O PERFIL PROFESSOR NO CADASTRO DE USUÁRIOS.'},{status:410});}
export const GET=moved;
export const POST=moved;
export const PATCH=moved;
