import assert from 'node:assert/strict';
import test from 'node:test';
import sharpImport from 'sharp';
import type {SharpConstructor} from '../node_modules/sharp/dist/index.d.mts';
const sharp=sharpImport as SharpConstructor;
import {parseProductSubmission,validateProductImageContent} from '../lib/products/submission';
function form(){const value=new FormData();for(const [key,text] of Object.entries({categoryId:'cat',nameEn:'Cup',descriptionEn:'Handmade cup',price:'100',inventoryQuantity:'2',preparationDays:'1'}))value.set(key,text);value.append('occasionIds','gift');return value;}
void test('product parser distinguishes omitted translations from intentional clearing',()=>{
 const value=form();const omitted=parseProductSubmission(value);assert.ok(omitted.input);
 assert.equal(omitted.input.nameNe,undefined);assert.equal(omitted.input.descriptionNe,undefined);
 value.set('nameNe','');value.set('descriptionNe','');const cleared=parseProductSubmission(value);
 assert.equal(cleared.input?.nameNe,null);assert.equal(cleared.input?.descriptionNe,null);
 value.set('nameNe','Nepali name');assert.equal(parseProductSubmission(value).input?.nameNe,'Nepali name');
});
void test('product upload rejects signature-only corrupt image content',async()=>{
 for(const [type,bytes] of [['image/jpeg',[255,216,255,0]],['image/png',[137,80,78,71,13,10,26,10]],['image/webp',[82,73,70,70,0,0,0,0,87,69,66,80]]] as const)
 assert.ok(await validateProductImageContent(new File([new Uint8Array(bytes)],'corrupt',{type})),type);
});
void test('product upload fully decodes valid images and rejects extreme dimensions',async()=>{
 const image=sharp({create:{width:12,height:8,channels:3,background:'#334455'}});
 for(const [type,bytes] of [['image/png',await image.clone().png().toBuffer()],['image/jpeg',await image.clone().jpeg().toBuffer()],['image/webp',await image.clone().webp().toBuffer()]] as const)
 assert.equal(await validateProductImageContent(new File([new Uint8Array(bytes)],'valid',{type})),null,type);
 const huge=await sharp({create:{width:8001,height:1,channels:3,background:'#ffffff'}}).png().toBuffer();
 assert.ok(await validateProductImageContent(new File([new Uint8Array(huge)],'extreme.png',{type:'image/png'})));
 const truncated=(await image.png().toBuffer()).subarray(0,50);
 assert.ok(await validateProductImageContent(new File([new Uint8Array(truncated)],'truncated.png',{type:'image/png'})));
});
